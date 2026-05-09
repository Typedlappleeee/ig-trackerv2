import { contextBridge, ipcRenderer } from 'electron'

// Ce fichier fait le pont entre Electron (Node.js) et React (browser)
// On expose UNIQUEMENT ce dont React a besoin, rien de plus (sécurité)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Exemple : si tu veux envoyer des messages entre React et Electron
  // send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
  // on: (channel: string, cb: (...args: unknown[]) => void) => ipcRenderer.on(channel, (_e, ...args) => cb(...args)),
})
