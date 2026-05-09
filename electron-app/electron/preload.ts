import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Proxy HTTP (bypass renderer CORS) — GéeLark + Instagram
  geelarkRequest: (opts: {
    method: 'GET' | 'POST' | 'PUT'
    url: string
    headers?: Record<string, string>
    body?: unknown
    isText?: boolean
  }) => ipcRenderer.invoke('geelark-request', opts),

  // Open native video file picker → returns file path or null
  pickVideoFile: () => ipcRenderer.invoke('pick-video-file'),

  // Upload a local video file to GéeLark and return its token
  uploadVideoGeelark: (opts: { bearer: string; filePath: string }) =>
    ipcRenderer.invoke('upload-video-geelark', opts),

  // Fetch an image as base64 data URL (proxy to bypass CORS/hotlink protection)
  fetchImage: (opts: { url: string; headers?: Record<string, string> }) =>
    ipcRenderer.invoke('fetch-image', opts),

  // Groq AI API call (returns chat completion)
  groqRequest: (opts: {
    apiKey: string
    messages: Array<{ role: string; content: string }>
    model?: string
    maxTokens?: number
  }) => ipcRenderer.invoke('groq-request', opts),
})
