import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Proxy HTTP requests through the main process to bypass renderer CORS.
  // Used for GéeLark API calls.
  geelarkRequest: (opts: {
    method: 'GET' | 'POST'
    url: string
    headers?: Record<string, string>
    body?: unknown
  }) => ipcRenderer.invoke('geelark-request', opts),
})
