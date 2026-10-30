// Pont natif de l'appli PC (fenêtre ScaleFlow) : seulement ce qui est listé ici est accessible.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sfDesktop', {
  hf: {
    login: (id, opts) => ipcRenderer.invoke('hf:login', String(id), opts || {}),
    status: id => ipcRenderer.invoke('hf:status', String(id)),
    logout: id => ipcRenderer.invoke('hf:logout', String(id)),
    fetch: (id, url, init) => ipcRenderer.invoke('hf:fetch', String(id), String(url), init || {}),
  },
})
