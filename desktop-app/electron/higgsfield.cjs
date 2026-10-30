// Higgsfield en LOCAL (appli PC uniquement) : chaque compte a sa propre session Chromium
// (partition « persist:hf-<id> »), gardée sur ce PC. La connexion — email, mot de passe, code 2FA —
// se fait dans la vraie page Higgsfield : ScaleFlow ne voit ni ne garde aucun identifiant.
// • hf:login   ouvre la fenêtre Higgsfield du compte ; à la fermeture, rend l'état de la session.
//              Avec { record: true } : enregistre les appels du site (sans en-têtes ni jetons) dans
//              un fichier de Téléchargements, pour caler la génération locale sur le vrai site.
// • hf:status  connecté ? (lu dans la page, via Clerk) — fenêtre cachée réutilisée.
// • hf:fetch   appel au site Higgsfield AVEC la session du compte (adresses *.higgsfield.ai seulement).
// • hf:logout  efface la session du compte.
const { app, BrowserWindow, session, shell } = require('electron')
const fs = require('fs')
const path = require('path')

const HF_HOME = 'https://higgsfield.ai/'
const hfPart = id => `persist:hf-${String(id).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'x'}`
const isHfUrl = u => {
  try { const h = new URL(u); return h.protocol === 'https:' && (h.hostname === 'higgsfield.ai' || h.hostname.endsWith('.higgsfield.ai')) } catch { return false }
}
const isAuthUrl = u => /^https:\/\/([a-z0-9-]+\.)*(google\.com|apple\.com|clerk\.[a-z.]+|clerk\.accounts\.dev)\//i.test(u)
// Sans « Electron/… » dans l'agent : certaines pages de connexion refusent les navigateurs intégrés.
const chromeUA = ua => ua.replace(/\s(Electron|ScaleFlow|scaleflow[\w-]*)\/\S+/gi, '')

function hfWindow(id, show) {
  const partition = hfPart(id)
  const win = new BrowserWindow({
    width: 1280, height: 860, show, title: 'Higgsfield', autoHideMenuBar: true, backgroundColor: '#0B0B0D',
    webPreferences: { partition, contextIsolation: true, sandbox: true },
  })
  win.webContents.setUserAgent(chromeUA(win.webContents.getUserAgent()))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHfUrl(url) || isAuthUrl(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition, contextIsolation: true, sandbox: true } } }
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  return win
}

// Fenêtre cachée par compte (état de session, appels au site).
const workers = new Map()
async function worker(id, fresh = false) {
  let w = workers.get(id)
  if (w && !w.isDestroyed() && !fresh) return w
  if (w && !w.isDestroyed()) w.destroy()
  w = hfWindow(id, false)
  workers.set(id, w)
  w.on('closed', () => { if (workers.get(id) === w) workers.delete(id) })
  await w.loadURL(HF_HOME).catch(() => undefined)
  return w
}
const WAIT_CLERK = 'for(let i=0;i<80&&!(window.Clerk&&window.Clerk.loaded);i++)await new Promise(r=>setTimeout(r,250));'
async function status(id, fresh = false) {
  const w = await worker(id, fresh)
  return w.webContents.executeJavaScript(`(async()=>{${WAIT_CLERK}
    const c=window.Clerk, u=c&&c.user;
    if(!c||!c.loaded) return {loggedIn:false,error:'page Higgsfield indisponible'};
    return u?{loggedIn:true,email:(u.primaryEmailAddress&&u.primaryEmailAddress.emailAddress)||null,name:u.fullName||u.username||null}:{loggedIn:false};
  })()`, true)
}

// ── enregistreur (calibrage) : appels XHR/fetch du site, sans en-têtes, jetons masqués ──
const SECRET_KEY = /token|jwt|secret|password|passwd|authorization|cookie|session|otp|code_verifier|refresh/i
function scrubValue(v, depth = 0) {
  if (depth > 8 || v == null) return v
  if (Array.isArray(v)) return v.slice(0, 50).map(x => scrubValue(x, depth + 1))
  if (typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) o[k] = SECRET_KEY.test(k) ? '[masqué]' : scrubValue(x, depth + 1)
    return o
  }
  if (typeof v === 'string') return v.replace(/((?:x-amz-)?signature|token|sig|key-pair-id|policy|credential)=([^&"\s]+)/gi, '$1=[masqué]').slice(0, 2000)
  return v
}
function scrubText(t) {
  if (t == null) return null
  try { return scrubValue(JSON.parse(t)) } catch { return scrubValue(String(t).slice(0, 4000)) }
}
const STATIC = /\.(js|mjs|css|png|jpe?g|webp|gif|svg|woff2?|ttf|mp4|webm|mov|ico|json\.map)(\?|$)/i
function startRecording(win) {
  const dbg = win.webContents.debugger
  const pending = new Map(), log = []
  try { dbg.attach('1.3') } catch { return null }
  dbg.sendCommand('Network.enable', { maxPostDataSize: 262144 }).catch(() => undefined)
  dbg.on('message', async (_e, method, p) => {
    if (method === 'Network.requestWillBeSent') {
      const r = p.request
      if (!isHfUrl(r.url) || /\/_clerk\/|\/\/clerk\./i.test(r.url) || STATIC.test(r.url) || r.method === 'OPTIONS') return
      if (p.type && !['XHR', 'Fetch', 'EventSource', 'Other'].includes(p.type)) return
      pending.set(p.requestId, { at: new Date().toISOString(), method: r.method, url: scrubValue(r.url), body: scrubText(r.postData ?? null) })
    } else if (method === 'Network.responseReceived') {
      const x = pending.get(p.requestId)
      if (x) { x.status = p.response.status; x.mime = p.response.mimeType }
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const x = pending.get(p.requestId)
      if (!x) return
      pending.delete(p.requestId)
      if (method === 'Network.loadingFinished') {
        try {
          const b = await dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId })
          x.response = b.base64Encoded ? '[binaire]' : scrubText(b.body)
        } catch { /* corps indisponible */ }
      } else x.failed = true
      log.push(x)
    }
  })
  return {
    save() {
      try { dbg.detach() } catch { /* déjà fermé */ }
      if (!log.length) return { file: null, count: 0 }
      const file = path.join(app.getPath('downloads'), `higgsfield-calibrage-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`)
      fs.writeFileSync(file, JSON.stringify({ app: 'ScaleFlow', note: 'Appels du site Higgsfield, sans en-têtes ni jetons.', calls: log }, null, 1))
      return { file, count: log.length }
    },
  }
}

function registerHiggsfield(ipcMain) {
  ipcMain.handle('hf:login', (_e, id, opts = {}) => new Promise(resolve => {
    const old = workers.get(id)
    if (old && !old.isDestroyed()) old.destroy()
    const win = hfWindow(id, true)
    const rec = opts.record ? startRecording(win) : null
    win.setTitle(rec ? 'Higgsfield — calibrage (ferme la fenêtre quand c’est fini)' : 'Higgsfield — connexion (ferme la fenêtre une fois connecté)')
    win.on('page-title-updated', e => e.preventDefault())
    win.loadURL(HF_HOME).catch(() => undefined)
    win.on('closed', async () => {
      const saved = rec ? rec.save() : { file: null, count: 0 }
      let st = { loggedIn: false }
      try { st = await status(id, true) } catch (e) { st = { loggedIn: false, error: String(e && e.message || e) } }
      if (saved.file) shell.showItemInFolder(saved.file)
      resolve({ ...st, recordFile: saved.file, recorded: saved.count })
    })
  }))
  ipcMain.handle('hf:status', (_e, id) => status(id, true))
  ipcMain.handle('hf:logout', async (_e, id) => {
    const w = workers.get(id)
    if (w && !w.isDestroyed()) w.destroy()
    await session.fromPartition(hfPart(id)).clearStorageData()
    return true
  })
  ipcMain.handle('hf:fetch', async (_e, id, url, init = {}) => {
    if (!isHfUrl(url)) throw new Error('adresse non autorisée (Higgsfield seulement)')
    const w = await worker(id)
    return w.webContents.executeJavaScript(`(async()=>{${WAIT_CLERK}
      const c=window.Clerk, t=c&&c.session?await c.session.getToken():null;
      const i=${JSON.stringify(init)}; i.headers=Object.assign({}, i.headers||{}, t?{authorization:'Bearer '+t}:{}); i.credentials='include';
      const r=await fetch(${JSON.stringify(url)}, i);
      return {status:r.status, contentType:r.headers.get('content-type')||'', body:await r.text()};
    })()`, true)
  })
}

module.exports = { registerHiggsfield, hfPart, isHfUrl, chromeUA, scrubText }
